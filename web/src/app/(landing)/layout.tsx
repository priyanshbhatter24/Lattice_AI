export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <style>{`
        /* Override paper texture for landing page */
        body::before {
          display: none !important;
        }
        body {
          background: #0a0908 !important;
        }
      `}</style>
      {children}
    </>
  );
}
