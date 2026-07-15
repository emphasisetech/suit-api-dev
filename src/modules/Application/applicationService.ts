// import Application, { IApplication } from './model/Application';

// export class ApplicationService {

//     async create(createDto: any) {
//         // Check for existing application by name
//         const existing = await Application.findOne({
//             name: { $regex: new RegExp(`^${createDto.name}$`, "i") },
//         });
//         if (existing) {
//             throw new Error('APPLICATION.DUPLICATE');
//         }

//         const result = await Application.create(createDto);
//         return result;
//     }

//     async findAll() {
//         const result = await Application.find().lean();
//         return result;
//     }

//     async getById(id: string) {
//         const result = await Application.findById(id).lean();
//         if (!result) throw new Error('APPLICATION.NOT_FOUND');
//         return result;
//     }

//     async update(id: string, updateDto: any) {
//         const result = await Application.findByIdAndUpdate(id, updateDto, { new: true }).lean();
//         if (!result) throw new Error('APPLICATION.NOT_FOUND');
//         return result;
//     }

//     async delete(id: string) {
//         const result = await Application.findByIdAndDelete(id).lean();
//         if (!result) throw new Error('APPLICATION.NOT_FOUND');
//         return result;
//     }
// }
