import express from 'express';
import {
    create,
    findAll,
    findAllCount,
    getServicesWithReq,
    getAccountByAccountName,
    getById,
    updateServices,
    changeStatus,
    updateRequestStatus,
    update,
    uploadLogo,
    uploadSignature,
    deleteAccountImage,
    getOutlets,
    createOutlet,
    updateOutlet,
    deleteOutlet,
    sendEmailVerification,
    verifyEmail,
} from './accountController';
import { protect } from '../../middleware/auth';

const router = express.Router();

router.post('/', create);
router.get('/', findAll);
router.get('/count', findAllCount);
router.get('/services-req', getServicesWithReq);
router.get('/details/:account_name', getAccountByAccountName);
router.get('/outlets/details/:accountName', protect, getOutlets);
router.get('/verify-email', verifyEmail);
router.get('/:id', getById);

router.post('/:id/send-email-verification', protect, sendEmailVerification);
router.post('/:id/outlets', protect, createOutlet);
router.patch('/:id/outlets/:outletId', protect, updateOutlet);
router.delete('/:id/outlets/:outletId', protect, deleteOutlet);
router.patch('/services/:id', updateServices);
router.patch('/status/:id', changeStatus);
router.patch('/services-req', updateRequestStatus);
router.post('/:id/logo', uploadLogo);
router.post('/:id/signature/:signatureType', uploadSignature);
router.delete('/:id/image/:imageType', deleteAccountImage);
router.patch('/:id', update);

export default router;
