import { Router } from "express";
import * as muralController from "../controllers/mural.controller";
import { authenticate } from "../middlewares/authenticate";
import { validate } from "../middlewares/validate";
import { createMuralPostSchema, listMuralQuerySchema } from "../interfaces/mural.interface";

const router = Router();

router.get("/", authenticate, validate(listMuralQuerySchema, "query"), muralController.list);

router.post("/", authenticate, validate(createMuralPostSchema), muralController.create);

router.delete("/:id", authenticate, muralController.remove);

router.post("/:id/like", authenticate, muralController.toggleLike);

export default router;
