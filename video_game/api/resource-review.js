import { createReviewHandler } from '../server/resource-review.mjs';
const handle=createReviewHandler();
export default { fetch: handle };
