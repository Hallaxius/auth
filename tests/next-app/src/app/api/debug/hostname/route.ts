export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  return Response.json({
    url: request.url,
    hostname: url.hostname,
    hostHeader: request.headers.get("host"),
    xForwardedHost: request.headers.get("x-forwarded-host"),
    urlHost: url.host,
  })
}
