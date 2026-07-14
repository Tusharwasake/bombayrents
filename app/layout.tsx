import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://bombayrents.com"),
  title: "BombayRents — real rents in Mumbai & Navi Mumbai, no brokers",
  description:
    "Crowdsourced map of actual rents paid by tenants across Mumbai and Navi Mumbai. Anonymous, free, no brokerage.",
  applicationName: "BombayRents",
  alternates: { canonical: "/" },
  openGraph: {
    title: "BombayRents — real rents in Mumbai & Navi Mumbai, no brokers",
    description:
      "Crowdsourced map of actual rents paid by tenants across Mumbai and Navi Mumbai. Anonymous, free, no brokerage.",
    url: "https://bombayrents.com",
    siteName: "BombayRents",
    type: "website",
    locale: "en_IN",
  },
  twitter: {
    card: "summary",
    title: "BombayRents — real rents in Mumbai & Navi Mumbai, no brokers",
    description:
      "Crowdsourced map of actual rents paid by tenants across Mumbai and Navi Mumbai. Anonymous, free, no brokerage.",
  },
};

// Map style, tiles and glyphs all come from openfreemap; pins come from
// Supabase. Warming those connections up front shaves DNS+TLS round trips
// off the map's first paint. (React hoists these links into <head>.)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="h-full bg-slate-100 text-slate-900 antialiased">
        <link rel="preconnect" href="https://tiles.openfreemap.org" crossOrigin="anonymous" />
        {supabaseUrl && (
          <link rel="preconnect" href={supabaseUrl} crossOrigin="anonymous" />
        )}
        {children}
      </body>
    </html>
  );
}
