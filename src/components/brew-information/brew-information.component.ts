import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnInit,
  Output,
  SimpleChange,
  ViewChild,
} from '@angular/core';
import { Brew } from '../../classes/brew/brew';
import { UISettingsStorage } from '../../services/uiSettingsStorage';
import { ModalController, Platform } from '@ionic/angular';
import { BREW_ACTION } from '../../enums/brews/brewAction';
import { BrewPopoverActionsComponent } from '../../app/brew/brew-popover-actions/brew-popover-actions.component';
import { Bean } from '../../classes/bean/bean';
import { Preparation } from '../../classes/preparation/preparation';
import { Mill } from '../../classes/mill/mill';
import { BREW_QUANTITY_TYPES_ENUM } from '../../enums/brews/brewQuantityTypes';
import { PREPARATION_STYLE_TYPE } from '../../enums/preparations/preparationStyleTypes';
import { NgxStarsComponent } from 'ngx-stars';
import { UIBrewHelper } from '../../services/uiBrewHelper';
import { UIBrewStorage } from '../../services/uiBrewStorage';
import { UIToast } from '../../services/uiToast';
import { UIAnalytics } from '../../services/uiAnalytics';
import { UIAlert } from '../../services/uiAlert';
import { UIImage } from '../../services/uiImage';
import { UIHelper } from '../../services/uiHelper';
import BREW_TRACKING from '../../data/tracking/brewTracking';
import { Settings } from '../../classes/settings/settings';
import { ShareService } from '../../services/shareService/share-service.service';
import { TranslateService } from '@ngx-translate/core';
import { BrewTrackingService } from '../../services/brewTracking/brew-tracking.service';
import { UIHealthKit } from '../../services/uiHealthKit';
import * as htmlToImage from 'html-to-image';
import { Visualizer } from '../../classes/visualizer/visualizer';
import moment from 'moment';
declare var window;
@Component({
  selector: 'brew-information',
  templateUrl: './brew-information.component.html',
  styleUrls: ['./brew-information.component.scss'],
})
export class BrewInformationComponent implements OnInit {
  @Input() public brew: Brew;
  @Input() public layout: string = 'brew';
  @ViewChild('card', { read: ElementRef })
  public cardEl: ElementRef;
  @ViewChild('brewStars', { read: NgxStarsComponent, static: false })
  public brewStars: NgxStarsComponent;

  @Output() public brewAction: EventEmitter<any> = new EventEmitter();
  public PREPARATION_STYLE_TYPE = PREPARATION_STYLE_TYPE;

  public bean: Bean;
  public preparation: Preparation;
  public mill: Mill;
  public brewQuantityEnum = BREW_QUANTITY_TYPES_ENUM;

  public settings: Settings = null;

  constructor(
    private readonly uiSettingsStorage: UISettingsStorage,
    public readonly uiBrewHelper: UIBrewHelper,
    private readonly uiBrewStorage: UIBrewStorage,
    private readonly uiToast: UIToast,
    private readonly uiAnalytics: UIAnalytics,
    private readonly uiAlert: UIAlert,
    private readonly uiImage: UIImage,
    private readonly modalCtrl: ModalController,
    private readonly uiHelper: UIHelper,
    private readonly shareService: ShareService,
    private readonly translate: TranslateService,
    private readonly brewTracking: BrewTrackingService,
    private readonly uiHealthKit: UIHealthKit,
    private readonly platform: Platform
  ) {}

  public ngOnInit() {
    if (this.brew) {
      this.settings = this.uiSettingsStorage.getSettings();
      this.bean = this.brew.getBean();
      this.preparation = this.brew.getPreparation();
      this.mill = this.brew.getMill();
    }
  }

  public hasCustomRatingRange(): boolean {
    if (this.settings) {
      // #379
      if (Number(this.settings.brew_rating) !== 5) {
        return true;
      } else if (Number(this.settings.brew_rating_steps) !== 1) {
        return true;
      }
    }
    return false;
  }

  public getCustomMaxRating(): number {
    if (this.settings) {
      return this.settings.brew_rating;
    }
    return 5;
  }

  public ngOnChanges(changes: SimpleChange) {
    // changes.prop contains the old and the new value...

    this.resetRenderingRating();
  }
  private resetRenderingRating() {
    if (this.brewStars && this.brew.rating > 0) {
      this.brewStars.setRating(this.brew.rating);
    }
  }

  public async showBrew() {
    await this.detailBrew();
    this.brewAction.emit([BREW_ACTION.DETAIL, this.brew]);
  }

  public async showBrewActions(event): Promise<void> {
    event.stopPropagation();
    event.stopImmediatePropagation();
    this.uiAnalytics.trackEvent(
      BREW_TRACKING.TITLE,
      BREW_TRACKING.ACTIONS.POPOVER_ACTIONS
    );
    const popover = await this.modalCtrl.create({
      component: BrewPopoverActionsComponent,

      componentProps: { brew: this.brew },
      id: BrewPopoverActionsComponent.COMPONENT_ID,
      cssClass: 'popover-actions',
      breakpoints: [0, 0.75, 1],
      initialBreakpoint: 1,
    });
    await popover.present();
    const data = await popover.onWillDismiss();
    if (data.role !== undefined) {
      await this.internalBrewAction(data.role as BREW_ACTION);
      this.brewAction.emit([data.role as BREW_ACTION, this.brew]);
    }
  }

  private async internalBrewAction(action: BREW_ACTION) {
    switch (action) {
      case BREW_ACTION.REPEAT:
        await this.repeatBrew();
        break;
      case BREW_ACTION.DETAIL:
        await this.detailBrew();
        break;
      case BREW_ACTION.EDIT:
        await this.editBrew();
        break;
      case BREW_ACTION.DELETE:
        try {
          await this.deleteBrew();
        } catch (ex) {}
        break;
      case BREW_ACTION.PHOTO_GALLERY:
        await this.viewPhotos();
        break;
      case BREW_ACTION.CUPPING:
        await this.cupBrew();
        break;
      case BREW_ACTION.SHOW_MAP_COORDINATES:
        await this.showMapCoordinates();
        break;
      case BREW_ACTION.FAST_REPEAT:
        await this.fastRepeatBrew();
        break;
      case BREW_ACTION.TOGGLE_FAVOURITE:
        await this.toggleFavourite();
        break;
      case BREW_ACTION.SHARE:
        await this.share();
        break;
      default:
        break;
    }
  }

  public async fastRepeatBrew() {
    if (this.uiBrewHelper.canBrewIfNotShowMessage()) {
      this.uiAnalytics.trackEvent(
        BREW_TRACKING.TITLE,
        BREW_TRACKING.ACTIONS.FAST_REPEAT
      );
      const repeatBrew = this.uiBrewHelper.copyBrewToRepeat(this.brew);
      await this.uiBrewStorage.add(repeatBrew);

      this.brewTracking.trackBrew(repeatBrew);
      if (
        this.settings.track_caffeine_consumption &&
        repeatBrew.grind_weight > 0 &&
        repeatBrew.getBean().decaffeinated === false
      ) {
        this.uiHealthKit.trackCaffeineConsumption(
          repeatBrew.getCaffeineAmount(),
          new Date()
        );
      }

      this.uiToast.showInfoToast('TOAST_BREW_REPEATED_SUCCESSFULLY');

      // If fast repeat is used, also recheck if bean package is consumed
      await this.uiBrewHelper.checkIfBeanPackageIsConsumedTriggerMessageAndArchive(
        this.brew.getBean()
      );
    }
  }

  public async longPressEditBrew(event) {
    event.stopPropagation();
    event.stopImmediatePropagation();
    await this.editBrew();
    this.brewAction.emit([BREW_ACTION.EDIT, this.brew]);
  }
  public async editBrew() {
    await this.uiBrewHelper.editBrew(this.brew);
  }
  public async repeatBrew() {
    if (this.uiBrewHelper.canBrewIfNotShowMessage()) {
      this.uiAnalytics.trackEvent(
        BREW_TRACKING.TITLE,
        BREW_TRACKING.ACTIONS.REPEAT
      );
      await this.uiBrewHelper.repeatBrew(this.brew);
    }
  }

  public async toggleFavourite() {
    if (!this.brew.favourite) {
      this.uiAnalytics.trackEvent(
        BREW_TRACKING.TITLE,
        BREW_TRACKING.ACTIONS.ADD_FAVOURITE
      );
      this.uiToast.showInfoToast('TOAST_BREW_FAVOURITE_ADDED');
      this.brew.favourite = true;
    } else {
      this.uiAnalytics.trackEvent(
        BREW_TRACKING.TITLE,
        BREW_TRACKING.ACTIONS.REMOVE_FAVOURITE
      );
      this.brew.favourite = false;
      this.uiToast.showInfoToast('TOAST_BREW_FAVOURITE_REMOVED');
    }
    await this.uiBrewStorage.update(this.brew);
  }

  public async detailBrew() {
    await this.uiBrewHelper.detailBrew(this.brew);
  }

  public async cupBrew() {
    await this.uiBrewHelper.cupBrew(this.brew);
  }

  public async showMapCoordinates() {
    this.uiAnalytics.trackEvent(
      BREW_TRACKING.TITLE,
      BREW_TRACKING.ACTIONS.SHOW_MAP
    );
    this.uiHelper.openExternalWebpage(this.brew.getCoordinateMapLink());
  }

  public async viewPhotos() {
    this.uiAnalytics.trackEvent(
      BREW_TRACKING.TITLE,
      BREW_TRACKING.ACTIONS.PHOTO_VIEW
    );
    await this.uiImage.viewPhotos(this.brew);
  }

  public shareToVisualizer() {
    const t: Visualizer = new Visualizer();
    t.meta.in = this.brew.grind_weight.toString();
    if (
      this.brew.getPreparation().getPresetStyleType() ===
      PREPARATION_STYLE_TYPE.ESPRESSO
    ) {
      t.meta.out = this.brew.brew_beverage_quantity.toString();
    } else {
      t.meta.out = this.brew.brew_quantity.toString();
    }

    t.meta.time =
      this.brew.brew_time.toString() +
      '.' +
      this.brew.brew_time_milliseconds.toString();
    t.meta.bean.brand = this.brew.getBean().roaster;
    t.meta.bean.type = this.brew.getBean().name;
    //t.meta.bean.roast_level = "medium-light";
    //t.meta.bean.roast_date = "2022-05";
    t.meta.shot.enjoyment = this.brew.rating.toString();
    t.meta.shot.tds = this.brew.tds.toString();
    t.meta.shot.ey = this.brew.getExtractionYield();
    t.meta.grinder.setting = this.brew.grind_size.toString();
    t.version = '2';
    t.profile.title = 'Beanconqueror';
    t.profile.author = 'Beanconqueror';
    t.profile.beverage_type = 'espresso';
    t.timestamp = this.brew.config.unix_timestamp.toString();
    t.clock = this.brew.config.unix_timestamp.toString();
    t.date = moment.unix(this.brew.config.unix_timestamp).toDate().toString();
    t.elapsed.push('0.045');
    t.elapsed.push('0.248');
    t.elapsed.push('0.552');
    t.elapsed.push('0.761');
    t.elapsed.push('1.0');
    t.totals.weight.push('1');
    t.totals.weight.push('2');
    t.totals.weight.push('3');
    t.totals.weight.push('4');
    t.totals.weight.push('5');

    //console.log(JSON.stringify(t));

    // this.saveTemplateAsFile('bla.json',t);
  }
  public saveTemplateAsFile(filename, dataObjToWrite) {
    const blob = new Blob([JSON.stringify(dataObjToWrite)], {
      type: 'text/json',
    });
    const link = document.createElement('a');

    link.download = filename;
    link.href = window.URL.createObjectURL(blob);
    link.dataset.downloadurl = ['text/json', link.download, link.href].join(
      ':'
    );

    const evt = new MouseEvent('click', {
      view: window,
      bubbles: true,
      cancelable: true,
    });

    link.dispatchEvent(evt);
    link.remove();
  }

  public async share() {
    this.uiAnalytics.trackEvent(
      BREW_TRACKING.TITLE,
      BREW_TRACKING.ACTIONS.SHARE
    );
    this.uiAlert.showLoadingSpinner();
    if (this.platform.is('ios')) {
      htmlToImage
        .toJpeg(this.cardEl.nativeElement)
        .then((_dataURL) => {
          // On iOS we need to do this a second time, because the rendering doesn't render everything (strange thing)
          setTimeout(() => {
            htmlToImage
              .toJpeg(this.cardEl.nativeElement)
              .then((_dataURLSecond) => {
                this.uiAlert.hideLoadingSpinner();
                setTimeout(() => {
                  this.shareService.shareImage(_dataURLSecond);
                }, 50);
              })
              .catch((error) => {
                this.uiAlert.hideLoadingSpinner();
                console.error('oops, something went wrong!', error);
              });
          }, 500);
        })
        .catch((error) => {
          this.uiAlert.hideLoadingSpinner();
          console.error('oops, something went wrong!', error);
        });
    } else {
      htmlToImage
        .toJpeg(this.cardEl.nativeElement)
        .then((_dataURL) => {
          this.uiAlert.hideLoadingSpinner();
          setTimeout(() => {
            this.shareService.shareImage(_dataURL);
          }, 50);
        })
        .catch((error) => {
          this.uiAlert.hideLoadingSpinner();
          console.error('oops, something went wrong!', error);
        });
    }

    //await this.shareService.shareBrew(this.brew);
  }

  public getCuppedBrewFlavors(): Array<string> {
    const flavors: Array<string> = [...this.brew.cupped_flavor.custom_flavors];
    for (const key in this.brew.cupped_flavor.predefined_flavors) {
      if (this.brew.cupped_flavor.predefined_flavors.hasOwnProperty(key)) {
        flavors.push(this.translate.instant('CUPPING_' + key));
      }
    }
    return flavors;
  }
  public deleteBrew(): Promise<any> {
    return new Promise(async (resolve, reject) => {
      this.uiAlert
        .showConfirm('DELETE_BREW_QUESTION', 'SURE_QUESTION', true)
        .then(
          async () => {
            // Yes
            this.uiAnalytics.trackEvent(
              BREW_TRACKING.TITLE,
              BREW_TRACKING.ACTIONS.DELETE
            );
            await this.__deleteBrew();
            this.uiToast.showInfoToast('TOAST_BREW_DELETED_SUCCESSFULLY');
            resolve(undefined);
          },
          () => {
            // No
            reject();
          }
        );
    });
  }

  private async __deleteBrew() {
    await this.uiBrewStorage.removeByObject(this.brew);
  }
}
