import type { VaultEntry } from '../types'
import './Inspector.css'

interface InspectorProps {
  collapsed: boolean
  onToggle: () => void
  entry: VaultEntry | null
  content: string | null
  entries: VaultEntry[]
  onNavigate: (target: string) => void
}

const STATUS_COLORS: Record<string, string> = {
  Active: '#4caf50',
  Done: '#2196f3',
  Paused: '#ff9800',
  Archived: '#9e9e9e',
  Dropped: '#f44336',
}

function formatDate(timestamp: number | null): string {
  if (!timestamp) return '—'
  const d = new Date(timestamp * 1000)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function countWords(content: string | null): number {
  if (!content) return 0
  // Strip YAML frontmatter
  const stripped = content.replace(/^---[\s\S]*?---\n?/, '')
  const words = stripped.trim().split(/\s+/).filter((w) => w.length > 0)
  return words.length
}

function PropertiesPanel({ entry, content }: { entry: VaultEntry; content: string | null }) {
  const statusColor = entry.status ? STATUS_COLORS[entry.status] ?? '#888' : undefined
  const wordCount = countWords(content)

  return (
    <div className="inspector__section">
      <h4>Properties</h4>
      <div className="inspector__props">
        {entry.isA && (
          <div className="inspector__prop">
            <span className="inspector__prop-label">Type</span>
            <span className="inspector__prop-value">{entry.isA}</span>
          </div>
        )}
        {entry.status && (
          <div className="inspector__prop">
            <span className="inspector__prop-label">Status</span>
            <span
              className="inspector__status-pill"
              style={{ backgroundColor: statusColor }}
            >
              {entry.status}
            </span>
          </div>
        )}
        {entry.owner && (
          <div className="inspector__prop">
            <span className="inspector__prop-label">Owner</span>
            <span className="inspector__prop-value">{entry.owner}</span>
          </div>
        )}
        {entry.cadence && (
          <div className="inspector__prop">
            <span className="inspector__prop-label">Cadence</span>
            <span className="inspector__prop-value">{entry.cadence}</span>
          </div>
        )}
        <div className="inspector__prop">
          <span className="inspector__prop-label">Modified</span>
          <span className="inspector__prop-value">{formatDate(entry.modifiedAt)}</span>
        </div>
        <div className="inspector__prop">
          <span className="inspector__prop-label">Words</span>
          <span className="inspector__prop-value">{wordCount}</span>
        </div>
      </div>
      <button className="inspector__add-prop" disabled>
        + Add property
      </button>
    </div>
  )
}

export function Inspector({ collapsed, onToggle, entry, content, entries, onNavigate }: InspectorProps) {
  return (
    <aside className={`inspector ${collapsed ? 'inspector--collapsed' : ''}`}>
      <div className="inspector__header">
        <button className="inspector__toggle" onClick={onToggle}>
          {collapsed ? '\u25C0' : '\u25B6'}
        </button>
        {!collapsed && <h3>Inspector</h3>}
      </div>
      {!collapsed && (
        <div className="inspector__content">
          {entry ? (
            <PropertiesPanel entry={entry} content={content} />
          ) : (
            <div className="inspector__section">
              <h4>Properties</h4>
              <p className="inspector__empty">No note selected</p>
            </div>
          )}
          <div className="inspector__section">
            <h4>Relationships</h4>
            <p className="inspector__empty">No relationships</p>
          </div>
        </div>
      )}
    </aside>
  )
}
