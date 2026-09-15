import { Router } from "express";
import * as followController from "../controllers/follow.controller";
import { authenticate } from "../middlewares/authenticate";
import { validate } from "../middlewares/validate";
import { createFollowSchema, listFollowsQuerySchema } from "../interfaces/follow.interface";

const router = Router();

router.post("/", authenticate, validate(createFollowSchema), followController.create);

router.get("/", authenticate, validate(listFollowsQuerySchema, "query"), followController.list);

router.delete("/:followingId", authenticate, followController.remove);

export default router;
