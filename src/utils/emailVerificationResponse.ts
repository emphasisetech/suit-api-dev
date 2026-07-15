import { Request, Response } from "express";

export const wantsHtmlResponse = (req: Request) =>
  String(req.headers.accept || "").includes("text/html");

export const sendEmailVerificationPage = (
  res: Response,
  statusCode: number,
  title: string,
  message: string
) => {
  const isSuccess = statusCode >= 200 && statusCode < 300;
  const accent = isSuccess ? "#16a34a" : "#dc2626";

  return res.status(statusCode).send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        font-family: Arial, sans-serif;
        color: #111827;
        background: #f8fafc;
      }
      main {
        width: min(92vw, 440px);
        padding: 28px;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        background: #ffffff;
        box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08);
      }
      .mark {
        width: 44px;
        height: 44px;
        display: grid;
        place-items: center;
        border-radius: 999px;
        color: #ffffff;
        background: ${accent};
        font-size: 16px;
        font-weight: 700;
      }
      h1 {
        margin: 18px 0 8px;
        font-size: 24px;
      }
      p {
        margin: 0;
        line-height: 1.6;
        color: #4b5563;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="mark">${isSuccess ? "OK" : "!"}</div>
      <h1>${title}</h1>
      <p>${message}</p>
    </main>
  </body>
</html>`);
};
