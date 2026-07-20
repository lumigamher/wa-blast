import { OrdersBoard } from "../_components/orders-board";
import { getOrdersBoardData } from "../actions";

export default async function ListSlot() {
  const initial = await getOrdersBoardData();
  return <OrdersBoard initial={initial} />;
}
