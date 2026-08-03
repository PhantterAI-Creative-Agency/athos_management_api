import { Router } from "express";
import * as bibleController from "../controllers/bible.controller";
import { authenticate } from "../middlewares/authenticate";
import { validate } from "../middlewares/validate";
import { bibleChapterParamsSchema, bibleChapterQuerySchema } from "../interfaces/bible.interface";

const router = Router();

router.get(
  "/:book/:chapter",
  authenticate,
  validate(bibleChapterParamsSchema, "params"),
  validate(bibleChapterQuerySchema, "query"),
  bibleController.getChapter,
);

export default router;
