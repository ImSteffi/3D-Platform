import Field from '../Field/Field'

export type TextFieldProps = {
  id: string;
  label: string;
  name: string;
  type?: "text" | "password" | "email";
  value: string;
  autoComplete?: string;
  error?: string;
  hint?: string;
  placeholder?: string;
  required?: boolean;
  onChange: (value: string) => void;
};

/** A single-line text input with a label. Same look as Field; kept for existing callers. */
export default function TextField(props: TextFieldProps) {
  return <Field {...props} />;
}
