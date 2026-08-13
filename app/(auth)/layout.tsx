export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center bg-slate-100 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold text-slate-900">LP Printing</h1>
          <p className="text-sm text-slate-500">Business Management System</p>
        </div>
        {children}
      </div>
    </div>
  );
}
