# Node TS Auth System

## Overview
This is a NodeJS authentication and  management system built with TypeScript, Express, and MongoDB. It features a modular architecture, JWT authentication, and centralized routing.

## Features
*   **Authentication**: JWT-based auth (Login, Register).
*   **Modular Architecture**: Domain-centric modules.
*   **Roles & Permissions**: Support for Superadmin, Client, Agency, etc.
*   **Swagger Documentation**: API docs available at `/api-docs`.



## Installation

1.  Clone the repository.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Create a `.env` file based on `.env.example` (ensure `MONGO_URI` is set).

## Scripts

*   `npm run busild`: Compile TypeScript to JavaScript.
*   `npm run dev`: Run development server with nodemon.
*   `npm start`: Run production server.
*   `npm test`: Run automated tests.

## API Documentation
Start the server and visit:
http://localhost:5000/api-docs

## Tests
Run integration tests using Jest:
```bash
npm test
```
