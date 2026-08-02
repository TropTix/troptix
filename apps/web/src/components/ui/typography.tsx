export function TypographyH1({ text, classes = '' }) {
  return (
    <h1
      className={`${classes} scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl`}
    >
      {text}
    </h1>
  );
}

export function TypographyH3({ text, classes = '' }) {
  return (
    <h3
      className={`${classes} scroll-m-20 text-2xl font-semibold tracking-tight`}
    >
      {text}
    </h3>
  );
}

export function TypographyH4({ text, classes = '' }) {
  return (
    <h4
      className={`${classes} scroll-m-20 text-md font-semibold tracking-tight`}
    >
      {text}
    </h4>
  );
}

export function TypographyP({ text, classes = '' }) {
  return <p className={`${classes} leading-7 text-base`}>{text}</p>;
}

export function TypographyMuted({ text, classes = '' }) {
  return (
    <p className={`${classes} text-md font-medium leading-none`}>{text}</p>
  );
}

export function DividerWithText({ text, classes = '' }) {
  return (
    <div className="flex items-center">
      <hr className="grow mr-4 text-white" />
      <TypographyMuted text={text} classes={classes} />
      <hr className="grow ml-4 text-white" />
    </div>
  );
}
