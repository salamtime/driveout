export const config = {
  runtime: 'edge',
};

export default async function handler() {
  return new Response(
    JSON.stringify({ 
      status: 'ok', 
      time: new Date().toISOString(),
      runtime: 'edge',
      hasApiKey: !!process.env.GEMINI_API_KEY
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
}
