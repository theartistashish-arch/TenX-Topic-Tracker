import { Router, type IRouter } from "express";
import healthRouter from "./health";
import deleteAccountRouter from "./delete-account";

const router: IRouter = Router();

router.use(healthRouter);
router.use(deleteAccountRouter);

export default router;
