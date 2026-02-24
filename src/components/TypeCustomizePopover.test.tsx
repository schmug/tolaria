import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TypeCustomizePopover } from './TypeCustomizePopover'
import { resolveIcon, ICON_OPTIONS } from '../utils/iconRegistry'

describe('resolveIcon', () => {
  it('returns the correct icon component for known name', () => {
    const Icon = resolveIcon('wrench')
    expect(Icon).toBeDefined()
    // wrench should not be the default fallback (file-text)
    const fileTextIcon = resolveIcon('file-text')
    expect(Icon).not.toBe(fileTextIcon)
  })

  it('returns FileText fallback for null', () => {
    const Icon = resolveIcon(null)
    expect(Icon).toBeDefined()
  })

  it('returns FileText fallback for unknown name', () => {
    const Icon = resolveIcon('nonexistent-icon')
    expect(Icon).toBeDefined()
  })
})

describe('ICON_OPTIONS', () => {
  it('contains 200+ icons', () => {
    expect(ICON_OPTIONS.length).toBeGreaterThanOrEqual(200)
  })

  it('has unique names', () => {
    const names = ICON_OPTIONS.map((o) => o.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('uses kebab-case names', () => {
    for (const option of ICON_OPTIONS) {
      expect(option.name).toMatch(/^[a-z][a-z0-9-]*$/)
    }
  })
})

describe('TypeCustomizePopover', () => {
  const onChangeIcon = vi.fn()
  const onChangeColor = vi.fn()
  const onClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders color section and icon section', () => {
    render(
      <TypeCustomizePopover
        currentIcon="wrench"
        currentColor="blue"
        onChangeIcon={onChangeIcon}
        onChangeColor={onChangeColor}
        onClose={onClose}
      />
    )
    expect(screen.getByText('COLOR')).toBeInTheDocument()
    expect(screen.getByText('ICON')).toBeInTheDocument()
    expect(screen.getByText('Done')).toBeInTheDocument()
  })

  it('renders search input', () => {
    render(
      <TypeCustomizePopover
        currentIcon={null}
        currentColor={null}
        onChangeIcon={onChangeIcon}
        onChangeColor={onChangeColor}
        onClose={onClose}
      />
    )
    expect(screen.getByPlaceholderText('Search icons…')).toBeInTheDocument()
  })

  it('filters icons by search query', () => {
    render(
      <TypeCustomizePopover
        currentIcon={null}
        currentColor={null}
        onChangeIcon={onChangeIcon}
        onChangeColor={onChangeColor}
        onClose={onClose}
      />
    )

    const searchInput = screen.getByPlaceholderText('Search icons…')
    fireEvent.change(searchInput, { target: { value: 'book' } })

    // Should show book-related icons
    expect(screen.getByTitle('book')).toBeInTheDocument()
    expect(screen.getByTitle('book-open')).toBeInTheDocument()
    // Should not show unrelated icons
    expect(screen.queryByTitle('wrench')).not.toBeInTheDocument()
  })

  it('shows empty state when no icons match search', () => {
    render(
      <TypeCustomizePopover
        currentIcon={null}
        currentColor={null}
        onChangeIcon={onChangeIcon}
        onChangeColor={onChangeColor}
        onClose={onClose}
      />
    )

    const searchInput = screen.getByPlaceholderText('Search icons…')
    fireEvent.change(searchInput, { target: { value: 'zzzznonexistent' } })

    expect(screen.getByText('No icons found')).toBeInTheDocument()
  })

  it('calls onChangeColor when a color is clicked', () => {
    render(
      <TypeCustomizePopover
        currentIcon={null}
        currentColor={null}
        onChangeIcon={onChangeIcon}
        onChangeColor={onChangeColor}
        onClose={onClose}
      />
    )

    const colorButtons = screen.getAllByTitle(/red|blue|green|purple|yellow|orange|teal|pink/i)
    fireEvent.click(colorButtons[0])

    expect(onChangeColor).toHaveBeenCalled()
  })

  it('calls onChangeIcon when an icon is clicked', () => {
    render(
      <TypeCustomizePopover
        currentIcon={null}
        currentColor={null}
        onChangeIcon={onChangeIcon}
        onChangeColor={onChangeColor}
        onClose={onClose}
      />
    )

    fireEvent.click(screen.getByTitle('wrench'))
    expect(onChangeIcon).toHaveBeenCalledWith('wrench')
  })

  it('calls onClose when Done is clicked', () => {
    render(
      <TypeCustomizePopover
        currentIcon={null}
        currentColor={null}
        onChangeIcon={onChangeIcon}
        onChangeColor={onChangeColor}
        onClose={onClose}
      />
    )

    fireEvent.click(screen.getByText('Done'))
    expect(onClose).toHaveBeenCalled()
  })

  it('renders all color options including teal and pink', () => {
    render(
      <TypeCustomizePopover
        currentIcon={null}
        currentColor={null}
        onChangeIcon={onChangeIcon}
        onChangeColor={onChangeColor}
        onClose={onClose}
      />
    )

    expect(screen.getByTitle('Teal')).toBeInTheDocument()
    expect(screen.getByTitle('Pink')).toBeInTheDocument()
  })
})
