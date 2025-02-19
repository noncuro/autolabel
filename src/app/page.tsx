import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import EmailViewerTabs from "../components/EmailViewerTabs";
import NavBar from "../components/NavBar";
import Providers from "../components/Providers";
import { authOptions } from "./api/auth/[...nextauth]/autoOptions";
export default async function Home() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/api/auth/signin");
  }

  return (
    <main>
      <Providers>
        <NavBar />
        <div className="p-4">
          <EmailViewerTabs />
        </div>
      </Providers>
    </main>
  );
}
