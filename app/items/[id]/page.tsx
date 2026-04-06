import { redirect } from "next/navigation";

export default async function ItemDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/?item=${id}`);
}
