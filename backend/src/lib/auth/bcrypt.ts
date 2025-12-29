import bcrpyt from "bcrypt"

export const hashPassword = async (pw: string) => await bcrpyt.hash(pw, 12)
export const comparePassword = async (pw: string, hash: string) => await bcrpyt.compare(pw, hash)