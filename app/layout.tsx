import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bombay Rent — real rents in Mumbai & Navi Mumbai, no brokers",
  description:
    "Crowdsourced map of actual rents paid by tenants across Mumbai and Navi Mumbai. Anonymous, free, no brokerage.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="h-full bg-slate-100 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
