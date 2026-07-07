export default function PageTitle({ children, accion }) {
  return (
    <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
      <h1 className="text-2xl font-display font-bold">{children}</h1>
      {accion}
    </div>
  );
}
