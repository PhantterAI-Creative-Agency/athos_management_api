import { Router } from "express";
import * as highlightsController from "../controllers/highlights.controller";
import { authenticate } from "../middlewares/authenticate";
import { validate } from "../middlewares/validate";
import { createHighlightSchema, listHighlightsQuerySchema } from "../interfaces/highlight.interface";

const router = Router();

router.get("/", authenticate, validate(listHighlightsQuerySchema, "query"), highlightsController.list);

router.post("/", authenticate, validate(createHighlightSchema), highlightsController.create);

router.delete("/:id", authenticate, highlightsController.remove);

router.post("/:id/like", authenticate, highlightsController.toggleLike);

export default router;
