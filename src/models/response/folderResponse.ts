import { FolderWithId } from "jslib-common/models/export/folderWithId";
import { FolderView } from "jslib-common/models/view/folderView";

import { BaseResponse } from "jslib-node/cli/models/response/baseResponse";

export class FolderResponse extends FolderWithId implements BaseResponse {
  object: string;

  constructor(o: FolderView) {
    super();
    this.object = "folder";
    this.build(o);
  }
}
