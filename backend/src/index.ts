import e from "express";
import dotenv from "dotenv"
import cors from "cors"
import cookieParser from "cookie-parser"
import studentRouter from "./routes/student.route";
import { counselorRouter } from "./routes/counselor.route";
import { adminRouter } from "./routes/admin.route";
import { connectRedis } from "./lib/redis/redisClient";
import publicRouter from "./routes/public.route";

dotenv.config()
const app = e()

const port = process.env.PORT || 3000

//Middlewares
connectRedis().catch(console.error)

app.use(cookieParser())
app.use(cors({
  origin: "http://localhost:3000",
  credentials: true
}))
app.use(e.json())
app.use(e.urlencoded({ extended: true }))

//Routers
app.use("/api/student", studentRouter)
app.use("/api/counselor", counselorRouter)
app.use("/api/admin", adminRouter)
app.use("/api/public", publicRouter)

app.listen(port, () => {
    console.log(`Listening to port ${port}`)
})
