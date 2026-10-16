"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { SEMESTER_COOKIE } from "@/lib/data/semesters";

export async function chooseSemester(formData: FormData) {
  const id = String(formData.get("semester") ?? "");
  const jar = await cookies();
  if (/^[0-9a-f-]{36}$/i.test(id)) jar.set(SEMESTER_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 180 });
  else jar.delete(SEMESTER_COOKIE);
  revalidatePath("/", "layout");
}
