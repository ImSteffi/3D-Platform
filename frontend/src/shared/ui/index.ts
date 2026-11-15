/**
 * Shared UI kit. Import from here: `import { Panel, Button } from '../../shared/ui'`.
 * Look and rules: DESIGN.md. Every component also works on a dark Lens surface when an ancestor has
 * class "on-dark" (or the shell is in lens mode).
 */

/** Surface. variant 'glass' (frosted, default) | 'solid' (opaque, for plans and photos being judged) | 'well' (inset); `as`; padding 'none'|'sm'|'md'|'lg'. */
export { default as Panel } from './Panel/Panel'
export type { PanelProps, PanelVariant, PanelPadding } from './Panel/Panel'

/** Pill button. variant 'primary' (ink, one per view) | 'secondary' | 'quiet' | 'danger'; size 'md' 44px | 'lg' 50px; icon, loading, disabled; `to` renders a router link, `href` an anchor. */
export { default as Button } from './Button/Button'
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button/Button'

/** 1.6px stroke icon: <Icon name="camera" size={18} />. One set; never use emoji or unicode glyphs. */
export { default as Icon } from './Icon/Icon'
export type { IconName, IconProps } from './Icon/Icon'

/** Label above, hint/error below. Renders its own input or textarea (value + onChange(text)), or wraps custom children. */
export { default as Field } from './Field/Field'
export type { FieldProps } from './Field/Field'

/** Single-line Field with required id/name/value; kept for existing forms. */
export { default as TextField } from './TextField/TextField'
export type { TextFieldProps } from './TextField/TextField'

/** Segmented switch: options [{ value, label, count? }], value, onChange(value). */
export { default as Segmented } from './Segmented/Segmented'
export type { SegmentedProps, SegmentedOption } from './Segmented/Segmented'

/** A Space's journey pill: items [{ label, state: 'done'|'current'|'later', owner?: 'you'|'team', to?, selected? }]. Feed it journeySteps(status). */
export { default as Steps } from './Steps/Steps'
export type { StepsProps, StepItem, StepState } from './Steps/Steps'

/** Small status chip. tone 'neutral' (default) | 'amber' (your move) | 'green' (done) | 'red' (retake / error). */
export { default as StatusPill } from './StatusPill/StatusPill'
export type { StatusPillProps, StatusTone } from './StatusPill/StatusPill'

/** "Your move" / "With the team" chip. who 'you'|'team'|'done' (from whoseMove(status)); perspective 'customer' (default) | 'operator' (mirrored); optional label. */
export { default as WhoseMove } from './WhoseMove/WhoseMove'
export type { WhoseMoveProps } from './WhoseMove/WhoseMove'

/** One thin tick per photo: states Array<'taken'|'next'|'retake'|'todo'>, optional onSelect(index). Pair with a mono count ("9 / 20"). */
export { default as Ticks } from './Ticks/Ticks'
export type { TicksProps, TickState } from './Ticks/Ticks'

/** Centred "nothing here yet" block for inside a Panel: icon, title, text, action. */
export { default as EmptyState } from './EmptyState/EmptyState'
export type { EmptyStateProps } from './EmptyState/EmptyState'

/** Red inline alert: children = what went wrong and what to do; optional onRetry. Renders nothing when empty. */
export { default as InlineError } from './InlineError/InlineError'
export type { InlineErrorProps } from './InlineError/InlineError'

/** Loading indicator: size, label, block (centred in a tall area). */
export { default as Spinner } from './Spinner/Spinner'
export type { SpinnerProps } from './Spinner/Spinner'

/** Modal confirmation, for destructive actions only: title, children, confirmLabel, busy, busyLabel, error, onConfirm, onCancel. */
export { default as ConfirmDialog } from './ConfirmDialog/ConfirmDialog'
export type { ConfirmDialogProps } from './ConfirmDialog/ConfirmDialog'

/** Inset form area used by the operator's create forms: children, className. */
export { default as FormPanel } from './FormPanel/FormPanel'

/** Plain counted figure: title, value, detail. Only for numbers the data really has. */
export { default as Card } from './Card/Card'

/** Square mark for a customer organisation: variant (number). */
export { default as OrganizationMark } from './OrganizationMark/OrganizationMark'

/** Line drawing of a space, for where no real image exists: variant (number). */

/** Loading placeholders with a left-to-right shimmer wave. */
export { default as Skeleton, SkeletonGroup } from './Skeleton/Skeleton'
export type { SkeletonProps, SkeletonGroupProps } from './Skeleton/Skeleton'
