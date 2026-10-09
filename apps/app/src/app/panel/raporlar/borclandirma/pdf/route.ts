import { debtRunsReport } from "../../extra-reports";
import { tabularPdf } from "../../tabular";

export const dynamic = "force-dynamic";

export const { GET, POST } = tabularPdf(debtRunsReport);
