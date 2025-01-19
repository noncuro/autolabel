import { getServerSession } from "next-auth/next";
import { google } from 'googleapis';
import type { GaxiosResponse } from 'googleapis-common';
import { gmail_v1 } from 'googleapis';
import { authOptions } from "../../auth/[...nextauth]/route";

export async function GET() {
  const session = await getServerSession(authOptions);
  
  if (!session?.accessToken) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({
      access_token: session.accessToken as string,
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    // Get the most recent email
    const response = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 1,
    });

    if (!response.data.messages?.length) {
      return new Response('No emails found', { status: 404 });
    }

    const messageId = response.data.messages[0].id!;
    const message: GaxiosResponse<gmail_v1.Schema$Message> = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
    });

    // Extract email details
    const headers = message.data.payload?.headers;
    const subject = headers?.find((h) => h.name === 'Subject')?.value;
    const from = headers?.find((h) => h.name === 'From')?.value;
    const body = message.data.snippet;

    return Response.json({
      subject,
      from,
      body,
    });
  } catch (error) {
    console.error('Error fetching email:', error);
    return new Response('Error fetching email', { status: 500 });
  }
}
