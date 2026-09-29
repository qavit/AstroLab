import { NextResponse, type NextRequest } from "next/server";

/** URL-driven locale selection only; never redirect based on browser preferences. */
export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-kakau-locale", request.nextUrl.pathname === "/en" || request.nextUrl.pathname.startsWith("/en/") ? "en" : "zh-TW");
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = { matcher: ["/((?!_next|favicon.svg).*)"] };
