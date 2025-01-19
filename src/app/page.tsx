import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import EmailViewer from "../components/EmailViewer";
import Providers from "../components/Providers";
import { authOptions } from "./api/auth/[...nextauth]/route";

export default async function Home() {
  const session = await getServerSession(authOptions);
  
  if (!session) {
    redirect("/api/auth/signin");
  }

  return (
    <main className="p-4">
      <Providers>
        <EmailViewer />
      </Providers>
    </main>
  );
}