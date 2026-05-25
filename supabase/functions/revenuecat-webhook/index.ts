Deno.serve(async (_req: Request) => {
  return new Response('OK', { status: 200 });
});
