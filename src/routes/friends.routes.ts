import { Router } from "express";
import * as friendsController from "../controllers/friends.controller";
import { authenticate } from "../middlewares/authenticate";
import { validate } from "../middlewares/validate";
import { createFriendshipSchema, listFriendsQuerySchema } from "../interfaces/friend.interface";

const router = Router();

router.post("/", authenticate, validate(createFriendshipSchema), friendsController.create);

router.get("/", authenticate, validate(listFriendsQuerySchema, "query"), friendsController.list);

router.patch("/:id", authenticate, friendsController.accept);

router.delete("/:id", authenticate, friendsController.remove);

export default router;
