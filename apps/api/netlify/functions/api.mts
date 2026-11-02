import serverless from "serverless-http";
import app from "../../dist/app.js";

export const handler = serverless(app);
