import { Link } from "react-router-dom";
import { Button, Card } from "../components/Ui";

const NotFound = () => (
  <div className="max-w-md mx-auto px-3 min-[380px]:px-3.5 sm:px-6 py-16 sm:py-20">
    <Card className="p-6 sm:p-8 text-center">
      <p className="text-[56px] font-semibold text-[#4F46E5] leading-none tabular-nums">404</p>
      <h1 className="text-[18px] font-semibold text-[color:var(--ink)] mt-3">Page not found</h1>
      <p className="text-[14px] text-[color:var(--muted)] mt-1.5">That page does not exist or has moved.</p>
      <Link to="/" className="inline-block mt-6"><Button>Back home</Button></Link>
    </Card>
  </div>
);

export default NotFound;