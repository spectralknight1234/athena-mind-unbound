import { supabase } from "@/integrations/supabase/client";

export type Conversation = {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type DbMessage = {
  id: string;
  conversation_id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  images: string[] | null;
  generated_image: string | null;
  created_at: string;
};

export async function listConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Conversation[];
}

export async function createConversation(title: string): Promise<Conversation> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) throw new Error("Não autenticado");
  const { data, error } = await supabase
    .from("conversations")
    .insert({ user_id: user.id, title: title.slice(0, 80) || "Nova conversa" })
    .select()
    .single();
  if (error) throw error;
  return data as Conversation;
}

export async function renameConversation(id: string, title: string) {
  const { error } = await supabase
    .from("conversations")
    .update({ title: title.slice(0, 80) })
    .eq("id", id);
  if (error) throw error;
}

export async function touchConversation(id: string) {
  const { error } = await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteConversation(id: string) {
  const { error } = await supabase.from("conversations").delete().eq("id", id);
  if (error) throw error;
}

export async function listMessages(conversationId: string): Promise<DbMessage[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as DbMessage[];
}

export async function insertMessage(payload: {
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  images?: string[];
  generated_image?: string;
}): Promise<DbMessage> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) throw new Error("Não autenticado");
  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: payload.conversation_id,
      user_id: user.id,
      role: payload.role,
      content: payload.content,
      images: payload.images ?? null,
      generated_image: payload.generated_image ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as DbMessage;
}

export async function updateAssistantMessage(
  id: string,
  patch: { content?: string; generated_image?: string | null },
) {
  const { error } = await supabase.from("messages").update(patch).eq("id", id);
  if (error) throw error;
}
