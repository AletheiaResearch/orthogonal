import type { DefaultTypedEditorState } from "@payloadcms/richtext-lexical";
import { RichText as ConvertRichText } from "@payloadcms/richtext-lexical/react";

import { jsxConverters } from "./converters";

/** Renders Payload Lexical content with internal-link resolution. */
export default function RichText({
  data,
  className,
}: {
  data: DefaultTypedEditorState;
  className?: string;
}) {
  return <ConvertRichText converters={jsxConverters} data={data} className={className} />;
}
