const dns = require('node:dns');
dns.setServers(['1.1.1.1', '8.8.8.8']);

import express, { Application, Request, Response } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import connectDB from './config/db';
import { uploadsRoot } from './config/uploads';
import routes from './routes/firstVersion';

dotenv.config({ override: true });



const app: Application = express();

// Middleware
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true, limit: '8mb' }));
app.use(cors());
app.use('/uploads', express.static(uploadsRoot));



// Connect to Database
connectDB();

const PORT = process.env.PORT || 5000;

app.get('/api/v1/restart', (req: Request, res: Response) => {
    res.send('API is running...');
});

// Routes
// Routes
app.use('/api/v1', routes);
// app.use('/api/v1/student', studentRoutes);
// app.use('/api/v1/accounts', accountRoutes);
// app.use('/api/v1/masters-data', masterDataRoutes);
// app.use('/api/v1/attendance', attendanceRoutes);
// app.use('/api/v1/dashboard-tiles', dashboardRoutes);
// app.use('/api/v1/agency-user', agencyUserRoutes);
// app.use('/api/v1/manageuser', manageUserRoutes);
// app.use('/api/v1/imported-users-sheet', importedSheetUsersRoutes);
// app.use('/api/v1/dealer-master', dealerMastersRoutes);
// app.use('/api/v1/manage-notifications', notificationsRoutes);

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
