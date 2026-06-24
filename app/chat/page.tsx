import { redirect } from "next/navigation";
import ChatRoom from "@/components/ChatRoom";
import { isAuthenticated } from "@/lib/auth";

export default async function ChatPage() {
  if (!(await isAuthenticated())) {
    redirect("/");
  }

  return <ChatRoom />;
}
