interface EmptyModuleProps {
  title: string
  invitation: string
}

/** Real empty state for a tab whose module hasn't been built yet. */
export function EmptyModule({ title, invitation }: EmptyModuleProps) {
  return (
    <div className="mx-auto max-w-md">
      <header className="pb-1 pt-2">
        <h1 className="text-screen-title text-ink">{title}</h1>
      </header>
      <div className="flex items-center justify-center py-36">
        <p className="text-body text-ink-dim">{invitation}</p>
      </div>
    </div>
  )
}
