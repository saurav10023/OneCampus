import { Link } from "react-router-dom";
import { Button, Card } from "../components/Ui";

const NotFound = () => (
  <div className="max-w-md mx-auto px-4 py-20">
    <Card className="p-8 text-center">
      <p className="text-[56px] font-semibold text-indigo-600 leading-none">404</p>
      <h1 className="text-[18px] font-semibold text-[#161827] mt-3">Page not found</h1>
      <p className="text-[14px] text-[#6A6F85] mt-1.5">That page does not exist or has moved.</p>
      <Link to="/" className="inline-block mt-6"><Button>Back home</Button></Link>
    </Card>
  </div>
);

export default NotFound;