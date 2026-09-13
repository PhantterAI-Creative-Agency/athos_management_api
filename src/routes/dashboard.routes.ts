import { Router } from "express";
import * as dashboardController from "../controllers/dashboard.controller";
import { authenticate } from "../middlewares/authenticate";
import { withRole } from "../middlewares/rbac";

const router = Router();

router.get("/summary", authenticate, withRole(["admin", "devAdmin"]), dashboardController.getSummary);

export default router;
