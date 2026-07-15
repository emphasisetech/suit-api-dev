import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { responseService } from '../../utils/response.util';
import { uploadsRoot } from '../../config/uploads';
import AppVersion, { IAppVersion } from './model/AppVersion';

type ApkMetadata = {
    platform?: string;
    latestVersion: string;
    downloadPath: string;
    downloadUrl?: string;
    fileName: string;
    forceUpdate: boolean;
    uploadedAt: string;
};

const uploadDirectory = path.join(uploadsRoot, 'apk');
const metadataPath = path.join(uploadDirectory, 'app-version.json');
const appReleaseBucket = () => {
    if (!mongoose.connection.db) throw new Error('Database is not connected.');
    return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'appReleases' });
};

const storeRelease = (fileName: string, platform: string, content: Buffer) =>
    new Promise<mongoose.Types.ObjectId>((resolve, reject) => {
        const stream = appReleaseBucket().openUploadStream(fileName, {
            metadata: { platform, uploadedAt: new Date() },
        });
        stream.once('error', reject);
        stream.once('finish', () => resolve(stream.id as mongoose.Types.ObjectId));
        stream.end(content);
    });

const deleteOtherReleases = async (platform: string, currentFileId: mongoose.Types.ObjectId) => {
    const bucket = appReleaseBucket();
    const oldFiles = await bucket
        .find({ 'metadata.platform': platform, _id: { $ne: currentFileId } })
        .toArray();

    await Promise.all(
        oldFiles.map((file) =>
            bucket.delete(file._id).catch((error) =>
                console.error('Error deleting previous app release:', error),
            ),
        ),
    );
};

const compareVersions = (currentVersion: string, latestVersion: string) => {
    const currentParts = currentVersion.split('.').map((part) => Number(part) || 0);
    const latestParts = latestVersion.split('.').map((part) => Number(part) || 0);
    const length = Math.max(currentParts.length, latestParts.length);

    for (let index = 0; index < length; index += 1) {
        const current = currentParts[index] || 0;
        const latest = latestParts[index] || 0;

        if (latest > current) return 1;
        if (latest < current) return -1;
    }

    return 0;
};

const ensureUploadDirectory = () => {
    fs.mkdirSync(uploadDirectory, { recursive: true });
};

const normalizePlatform = (value: unknown) =>
    String(value || 'android')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '') || 'android';

const readMetadata = (): ApkMetadata | null => {
    try {
        if (!fs.existsSync(metadataPath)) return null;
        return JSON.parse(fs.readFileSync(metadataPath, 'utf8')) as ApkMetadata;
    } catch (error) {
        console.error('Error reading app version metadata:', error);
        return null;
    }
};

const toMetadataResponse = (metadata: IAppVersion | ApkMetadata | null) => {
    if (!metadata) return null;
    const rawUploadedAt = metadata.uploadedAt;

    return {
        latestVersion: metadata.latestVersion,
        platform: metadata.platform || 'android',
        downloadPath: metadata.downloadPath,
        downloadUrl: metadata.downloadUrl,
        fileName: metadata.fileName,
        forceUpdate: metadata.forceUpdate === true,
        uploadedAt:
            rawUploadedAt instanceof Date
                ? rawUploadedAt.toISOString()
                : String(rawUploadedAt || ''),
    };
};

const getStoredMetadata = async (platform: string) => {
    const normalizedPlatform = normalizePlatform(platform);
    const dbMetadata = await AppVersion.findOne({ platform: normalizedPlatform }).lean<IAppVersion>();
    if (dbMetadata) return dbMetadata;

    const legacyMetadata = normalizedPlatform === 'android' ? readMetadata() : null;
    const fileMetadata =
        legacyMetadata && normalizePlatform(legacyMetadata.platform) === normalizedPlatform
            ? legacyMetadata
            : null;
    if (!fileMetadata) return null;

    return await AppVersion.findOneAndUpdate(
        { platform: normalizedPlatform },
        {
            $set: {
                platform: normalizedPlatform,
                latestVersion: fileMetadata.latestVersion,
                downloadPath: fileMetadata.downloadPath,
                downloadUrl: fileMetadata.downloadUrl || '',
                fileName: fileMetadata.fileName,
                forceUpdate: fileMetadata.forceUpdate === true,
                uploadedAt: fileMetadata.uploadedAt ? new Date(fileMetadata.uploadedAt) : new Date(),
            },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean<IAppVersion>();
};

const toAbsoluteUrl = (req: Request, value: string) => {
    if (!value) return '';
    if (/^https?:\/\//i.test(value)) return value;
    const protocol = String(req.headers['x-forwarded-proto'] || req.protocol).split(',')[0];
    return `${protocol}://${req.get('host')}${value.startsWith('/') ? value : `/${value}`}`;
};

const getDownloadPath = (platform: string) =>
    `/api/v1/app-version/download/${encodeURIComponent(normalizePlatform(platform))}`;

const getConfiguredVersionData = async (req: Request, platformOverride?: string) => {
    const platform = platformOverride || String(req.query.platform || 'android');
    const metadata = await getStoredMetadata(platform);

    if (metadata) {
        const metadataResponse = toMetadataResponse(metadata);
        const normalizedPlatform = normalizePlatform(metadataResponse?.platform || platform);
        return {
            latestVersion: metadataResponse?.latestVersion || '',
            downloadUrl: toAbsoluteUrl(req, getDownloadPath(normalizedPlatform)),
            forceUpdate: metadataResponse?.forceUpdate === true,
            metadata: metadataResponse,
        };
    }

    const platformKey = platform.toUpperCase();

    return {
        latestVersion:
            process.env[`APP_${platformKey}_LATEST_VERSION`] ||
            process.env.APP_LATEST_VERSION ||
            '1.0.0',
        downloadUrl:
            process.env[`APP_${platformKey}_DOWNLOAD_URL`] ||
            process.env.APP_DOWNLOAD_URL ||
            '',
        forceUpdate:
            String(
                process.env[`APP_${platformKey}_FORCE_UPDATE`] ||
                process.env.APP_FORCE_UPDATE ||
                'false',
            ).toLowerCase() !== 'false',
        metadata: null,
    };
};

export const downloadAppRelease = async (req: Request, res: Response) => {
    try {
        const platform = normalizePlatform(req.params.platform);
        const metadata = await getStoredMetadata(platform);

        if (!metadata?.fileName) {
            return responseService.notFoundResponse('No app release is available for this platform.', res);
        }

        if (metadata.gridFsFileId) {
            res.attachment(metadata.fileName);
            const stream = appReleaseBucket().openDownloadStream(metadata.gridFsFileId);
            stream.once('error', (error: any) => {
                console.error('Error streaming app release:', error);
                if (!res.headersSent) responseService.notFoundResponse('The app release file is missing.', res);
                else res.destroy(error);
            });
            stream.pipe(res);
            return;
        }

        // Backward compatibility for releases uploaded before GridFS storage was added.
        const filePath = path.join(uploadDirectory, path.basename(metadata.fileName));
        if (!fs.existsSync(filePath)) {
            return responseService.notFoundResponse(
                'The app release file is missing. Please upload the release again.',
                res,
            );
        }

        return res.download(filePath, metadata.fileName);
    } catch (error: any) {
        console.error('Error downloading app release:', error);
        return responseService.errorResponse(error, res);
    }
};

export const checkAppVersion = async (req: Request, res: Response) => {
    try {
        const currentVersion = String(req.query.currentVersion || '0.0.0');
        const { latestVersion, downloadUrl, forceUpdate } = await getConfiguredVersionData(req);
        const updateAvailable = compareVersions(currentVersion, latestVersion) > 0;

        return responseService.successResponse(
            {
                currentVersion,
                latestVersion,
                updateAvailable,
                forceUpdate: updateAvailable ? forceUpdate : false,
                downloadUrl: updateAvailable ? downloadUrl : '',
                message: updateAvailable
                    ? 'A new version is available. Please update the app.'
                    : 'App is up to date.',
            },
            'App version checked successfully',
            res,
        );
    } catch (error: any) {
        console.error('Error checking app version:', error);
        return responseService.errorResponse(error, res);
    }
};

export const getAppVersionAdmin = async (req: Request, res: Response) => {
    try {
        const { latestVersion, downloadUrl, forceUpdate, metadata } = await getConfiguredVersionData(req);

        return responseService.successResponse(
            {
                platform: metadata?.platform || String(req.query.platform || 'android'),
                latestVersion,
                downloadUrl,
                forceUpdate,
                fileName: metadata?.fileName || '',
                uploadedAt: metadata?.uploadedAt || '',
            },
            'App version details retrieved successfully',
            res,
        );
    } catch (error: any) {
        console.error('Error retrieving app version details:', error);
        return responseService.errorResponse(error, res);
    }
};

export const uploadAppApk = async (req: Request, res: Response) => {
    try {
        ensureUploadDirectory();
        const { fields, file } = await parseMultipartRequest(req);
        const platform = normalizePlatform(fields.platform);
        const latestVersion = String(fields.latestVersion || '').trim();
        const forceUpdate = String(fields.forceUpdate || 'false').toLowerCase() === 'true';

        if (!latestVersion) {
            return responseService.InvalidDataResponse('latestVersion is required.', res);
        }

        const lowerFileName = file?.filename.toLowerCase() || '';
        const expectedExtension = platform === 'ios' ? '.ipa' : '.apk';

        if (!file || !lowerFileName.endsWith(expectedExtension)) {
            return responseService.InvalidDataResponse(`Please upload a valid ${expectedExtension.toUpperCase()} file.`, res);
        }

        const safeVersion = latestVersion.replace(/[^a-zA-Z0-9._-]/g, '_');
        const fileName = `emphasisetech-suite-${platform}-${safeVersion}${expectedExtension}`;
        const gridFsFileId = await storeRelease(fileName, platform, file.content);

        const metadata: ApkMetadata = {
            platform,
            latestVersion,
            downloadPath: getDownloadPath(platform),
            fileName,
            forceUpdate,
            uploadedAt: new Date().toISOString(),
        };
        metadata.downloadUrl = toAbsoluteUrl(req, metadata.downloadPath);
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
        try {
            await AppVersion.findOneAndUpdate(
                { platform },
                {
                    $set: {
                        platform,
                        latestVersion: metadata.latestVersion,
                        downloadPath: metadata.downloadPath,
                        downloadUrl: metadata.downloadUrl,
                        fileName: metadata.fileName,
                        gridFsFileId,
                        forceUpdate: metadata.forceUpdate,
                        uploadedAt: new Date(metadata.uploadedAt),
                    },
                },
                { new: true, upsert: true, setDefaultsOnInsert: true },
            );
        } catch (error) {
            await appReleaseBucket().delete(gridFsFileId).catch(() => undefined);
            throw error;
        }

        // Re-read the active ID so concurrent uploads cannot preserve an older file.
        const activeRelease = await AppVersion.findOne({ platform }).select('gridFsFileId').lean();
        if (activeRelease?.gridFsFileId) {
            await deleteOtherReleases(platform, activeRelease.gridFsFileId);
        }

        // Remove legacy local releases for this platform after the durable copy is committed.
        fs.readdirSync(uploadDirectory)
            .filter((storedName) => storedName.toLowerCase().startsWith(`emphasisetech-suite-${platform}-`))
            .forEach((storedName) => fs.unlinkSync(path.join(uploadDirectory, storedName)));

        return responseService.successResponse(
            {
                ...metadata,
                downloadUrl: toAbsoluteUrl(req, metadata.downloadPath),
            },
            'APK uploaded successfully',
            res,
            201,
        );
    } catch (error: any) {
        console.error('Error uploading APK:', error);
        return responseService.errorResponse(error, res);
    }
};

export const updateAppForceUpdate = async (req: Request, res: Response) => {
    try {
        ensureUploadDirectory();
        const platform = normalizePlatform(req.body?.platform || req.query.platform);
        const { metadata } = await getConfiguredVersionData(req, platform);
        const forceUpdate = req.body?.forceUpdate === true || String(req.body?.forceUpdate).toLowerCase() === 'true';

        if (!metadata) {
            return responseService.InvalidDataResponse('Please upload an APK before changing force update.', res);
        }

        const updatedMetadata: ApkMetadata = {
            ...metadata,
            platform,
            forceUpdate,
        };
        fs.writeFileSync(metadataPath, JSON.stringify(updatedMetadata, null, 2));
        await AppVersion.findOneAndUpdate(
            { platform },
            { $set: { forceUpdate } },
            { new: true, upsert: false },
        );

        return responseService.successResponse(
            {
                ...updatedMetadata,
                downloadUrl: toAbsoluteUrl(req, updatedMetadata.downloadPath),
            },
            'Force update setting updated successfully',
            res,
        );
    } catch (error: any) {
        console.error('Error updating force update setting:', error);
        return responseService.errorResponse(error, res);
    }
};

const parseMultipartRequest = (req: Request) =>
    new Promise<{
        fields: Record<string, string>;
        file: { filename: string; content: Buffer } | null;
    }>((resolve, reject) => {
        const contentType = req.headers['content-type'] || '';
        const boundary = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType)?.[1] ||
            /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType)?.[2];

        if (!boundary) {
            reject(new Error('Invalid multipart request.'));
            return;
        }

        const chunks: Buffer[] = [];
        req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        req.on('error', reject);
        req.on('end', () => {
            const body = Buffer.concat(chunks);
            const delimiter = Buffer.from(`--${boundary}`);
            const fields: Record<string, string> = {};
            let file: { filename: string; content: Buffer } | null = null;
            let position = body.indexOf(delimiter);

            while (position !== -1) {
                position += delimiter.length;
                if (body.slice(position, position + 2).toString() === '--') break;
                if (body.slice(position, position + 2).toString() === '\r\n') position += 2;

                const next = body.indexOf(delimiter, position);
                if (next === -1) break;

                let part = body.slice(position, next);
                if (part.slice(-2).toString() === '\r\n') part = part.slice(0, -2);

                const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
                if (headerEnd !== -1) {
                    const header = part.slice(0, headerEnd).toString('utf8');
                    const content = part.slice(headerEnd + 4);
                    const name = /name="([^"]+)"/.exec(header)?.[1];
                    const filename = /filename="([^"]+)"/.exec(header)?.[1];

                    if (name && filename) {
                        file = { filename, content };
                    } else if (name) {
                        fields[name] = content.toString('utf8');
                    }
                }

                position = next;
            }

            resolve({ fields, file });
        });
    });
