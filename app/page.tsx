import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { isAuthenticated } from "@/lib/auth";

export default async function Home() {
  if (await isAuthenticated()) {
    redirect("/chat");
  }

  return <AuthForm />;
}
