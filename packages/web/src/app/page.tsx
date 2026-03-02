export default function HomePage() {
  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        fontFamily: "var(--font-display)",
        color: "var(--accent-cyan)",
        textAlign: "center",
        gap: "16px",
      }}
    >
      <h1 style={{ fontSize: "16px" }}>AGENTVERSE HUB</h1>
      <p
        style={{
          fontFamily: "var(--font-mono)",
          color: "var(--text-dimmed)",
          fontSize: "14px",
        }}
      >
        {">"} SYSTEM ONLINE_
      </p>
    </main>
  );
}
