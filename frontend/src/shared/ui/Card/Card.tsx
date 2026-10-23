import './Card.css'
type CardProps = {
  title: string
  value: string
  detail?: string
}

export default function Card({ title, value, detail }: CardProps) {
  return (
    <article className="card">
      <h2>{title}</h2>
      <p className="card-value">{value}</p>
      {detail && <p className="card-detail">{detail}</p>}
    </article>
  )
}
