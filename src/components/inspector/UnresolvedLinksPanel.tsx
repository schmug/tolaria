import { LinkBreak } from '@phosphor-icons/react'

export function UnresolvedLinksPanel({ unresolvedTargets }: { unresolvedTargets: string[] }) {
  if (unresolvedTargets.length === 0) return null

  return (
    <div>
      <h4 className="font-mono-overline mb-2 flex items-center gap-1 text-muted-foreground">
        <LinkBreak size={12} className="shrink-0" />
        Unresolved
      </h4>
      <div className="flex flex-col gap-1" data-testid="unresolved-links-list">
        {unresolvedTargets.map((target) => (
          <span key={target} className="text-xs text-muted-foreground">
            {target}
          </span>
        ))}
      </div>
    </div>
  )
}
