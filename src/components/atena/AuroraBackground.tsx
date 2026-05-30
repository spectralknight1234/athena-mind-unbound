export function AuroraBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <div
        className="absolute -top-32 -left-32 h-[28rem] w-[28rem] rounded-full blur-3xl animate-aurora"
        style={{ background: "var(--aurora-1)", opacity: 0.25 }}
      />
      <div
        className="absolute -top-20 right-0 h-[32rem] w-[32rem] rounded-full blur-3xl animate-aurora"
        style={{ background: "var(--aurora-2)", opacity: 0.22, animationDelay: "3s" }}
      />
      <div
        className="absolute bottom-0 left-1/3 h-[30rem] w-[30rem] rounded-full blur-3xl animate-aurora"
        style={{ background: "var(--aurora-3)", opacity: 0.2, animationDelay: "6s" }}
      />
    </div>
  );
}
