type TextFieldProps = {
  id: string;
  label: string;
  name: string;
  type?: "text" | "password" | "email";
  value: string;
  autoComplete?: string;
  error?: string;
  onChange: (value: string) => void;
};

export default function TextField({
  id,
  label,
  name,
  type = "text",
  value,
  autoComplete,
  error,
  onChange,
}: TextFieldProps) {
  const errorId = `${id}-error`;

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={name}
        type={type}
        value={value}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? (
        <p id={errorId} className="field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
