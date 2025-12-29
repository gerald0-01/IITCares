export const checkPassword = (pw: string) => {
    const regex = /\d|[^\w\s]/;
    if (pw.length < 5) return "Password too short."

    if (!regex.test(pw)) return "Password needs to include numbers or special characters."

    return ""
}