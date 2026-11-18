import StatusPill from '../StatusPill/StatusPill'

export type WhoseMoveProps = {
 /** Whose turn it is, always named from the customer's side: 'you' = the customer, 'team' = the team, 'done' = delivered. Pass whoseMove(status) straight in. */
 who: 'you' | 'team' | 'done'
 /** Who is reading. 'customer' (default): the customer's move is amber. 'operator': mirrored, the team's move is amber and reads "Your move". */
 perspective?: 'customer' | 'operator'
 /** Replaces the default words. */
 label?: string
 className?: string
}

const words = {
 customer: { you: '', team: 'With the team', done: 'Tour ready' },
 operator: { you: 'With the customer', team: '', done: 'Delivered' },
}

export default function WhoseMove({ who, perspective = 'customer', label, className }: WhoseMoveProps) {
 const text = label ?? words[perspective][who]
 if (!text) return null
 const mine = perspective === 'customer' ? who === 'you' : who === 'team'
 return <StatusPill tone={who === 'done' ? 'green' : mine ? 'amber' : 'neutral'} className={className}>{text}</StatusPill>
}
