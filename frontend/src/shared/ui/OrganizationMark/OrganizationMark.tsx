import Icon from '../Icon/Icon'
import './OrganizationMark.css'
export default function OrganizationMark({ variant = 0 }: { variant?: number }) {
 return <span className={`organization-mark organization-mark--${variant % 3}`}><Icon name="building" size={21} /></span>
}
